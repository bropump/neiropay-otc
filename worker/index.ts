import {Buffer} from 'buffer';
import {Connection,Keypair,PublicKey,type TransactionInstruction} from '@solana/web3.js';
import {unpackAccount} from '@solana/spl-token';
import {NEIRO,USDC,WSOL,PROGRAM,ata,pk,raw,derive,decode,validateTerms,createIx,fundIxs,settleIxs,rejectIxs,reclaimIxs,unwrapIx,buildTransaction,type Trade,type Terms} from '../src/chain';
type Env={ASSETS:Fetcher;DB:D1Database;RPC_URL:string;SETTLEMENT_SECRET:string;RATE_LIMITER?:RateLimit};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const conn=(env:Env)=>new Connection(env.RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
const authority=(env:Env)=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SETTLEMENT_SECRET)));
const isKey=(s:unknown):s is string=>{try{return typeof s==='string'&&s.length>=32&&s.length<=44&&new PublicKey(s).toBase58()===s;}catch{return false;}};
const rpcMethods=new Set(['getLatestBlockhash','getSignatureStatuses','getBalance','getTokenAccountBalance','getAccountInfo','getMultipleAccounts','sendTransaction','simulateTransaction','getBlockHeight','getFeeForMessage']);
async function remember(env:Env,t:Trade){await env.DB.prepare('INSERT INTO trades(address,seller,buyer,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(address) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(t.address,t.userA,t.userB,JSON.stringify(t),Date.now()).run();}
async function archived(env:Env,address:string):Promise<Trade|null>{const row=await env.DB.prepare('SELECT data FROM trades WHERE address=?').bind(address).first<{data:string}>();return row?JSON.parse(row.data):null;}
export async function readTrade(env:Env,address:string):Promise<Trade>{
 const c=conn(env),account=await c.getAccountInfo(pk(address),'confirmed');
 if(account){
  const t=decode(address,account);validateTerms(t,authority(env).publicKey.toBase58());
  const infos=await c.getMultipleAccountsInfo([ata(t.mintA,address),ata(t.mintB,address)],'confirmed');
  const balances=infos.map((v,i)=>{if(!v)throw new Error('Escrow is unavailable.');const a=unpackAccount(ata(i?t.mintB:t.mintA,address),v);if(a.owner.toBase58()!==address||a.mint.toBase58()!==(i?t.mintB:t.mintA))throw new Error('Escrow verification failed.');return a.isNative?(BigInt(v.lamports)-a.rentExemptReserve!).toString():a.amount.toString();});
  const trade:Trade={...t,balanceA:balances[0],balanceB:balances[1],status:t.expiry<=Date.now()/1000?'expired':'open',updatedAt:Date.now()};await remember(env,trade);return trade;
 }
 const old=await archived(env,address);if(!old)throw new Error('Trade not found. Check the address or wait for confirmation.');
 if(['settled','cancelled'].includes(old.status))return old;
 const signatures=await c.getSignaturesForAddress(pk(address),{limit:15},'finalized');
 for(const s of signatures.filter(s=>!s.err)){
  const tx=await c.getParsedTransaction(s.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
  if(!tx||tx.meta?.err)continue;
  for(const ix of tx.transaction.message.instructions){
   if(ix.programId.equals(PROGRAM)&&'data'in ix&&ix.accounts[1]?.toBase58()===address){
    // DvP terminal discriminators 2,3,4 encode to a one-byte base58 prefix only
    // after decoding the complete instruction payload.
    const bytes=decode58(ix.data);if(![2,3,4].includes(bytes[0]))continue;
    const closed:Trade={...old,status:bytes[0]===2?'settled':'cancelled',balanceA:'0',balanceB:'0',signature:s.signature,updatedAt:Date.now()};await remember(env,closed);return closed;
   }
  }
 }
 return {...old,status:'closed',updatedAt:Date.now()};
}
function decode58(s:string){const abc='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const ch of s){const i=abc.indexOf(ch);if(i<0)throw new Error('Invalid base58');n=n*58n+BigInt(i);}const out:number[]=[];while(n){out.unshift(Number(n%256n));n/=256n;}for(const ch of s){if(ch!=='1')break;out.unshift(0);}return Uint8Array.from(out);}
async function prepare(env:Env,input:Record<string,unknown>){
 const c=conn(env),key=authority(env),payer=input.payer;
 if(!isKey(payer)||!PublicKey.isOnCurve(pk(payer).toBytes()))throw new Error('Connect a standard Solana wallet.');
 let instructions:TransactionInstruction[],trade:Terms|Trade|undefined;
 if(input.action==='create'){
  const counterparty=input.counterparty;if(!isKey(counterparty)||counterparty===payer)throw new Error('Enter a different, valid counterparty wallet.');
  if(!['buy','sell'].includes(String(input.side))||!['USDC','SOL'].includes(String(input.payment)))throw new Error('Choose a supported trade pair.');
  const duration=Number(input.duration);if(![1,6,24,72,168].includes(duration))throw new Error('Choose a supported expiry.');
  const nonce=Buffer.from(crypto.getRandomValues(new Uint8Array(8))).readBigUInt64LE().toString();
  const userA=input.side==='sell'?payer:counterparty,userB=input.side==='sell'?counterparty:payer;
  const t:Terms={address:'',userA,userB,mintA:NEIRO,mintB:input.payment==='SOL'?WSOL:USDC,authority:key.publicKey.toBase58(),amountA:raw(String(input.neiro),6).toString(),amountB:raw(String(input.total),input.payment==='SOL'?9:6).toString(),expiry:Math.floor(Date.now()/1000)+duration*3600,nonce,destinationA:userA,destinationB:userB,earliest:null};
  t.address=derive(t)[0].toBase58();validateTerms(t,key.publicKey.toBase58());instructions=[createIx(t,payer)];trade=t;
 }else if(input.action==='unwrap'){
  instructions=[unwrapIx(payer)];
 }else{
  if(!isKey(input.address))throw new Error('Invalid trade address.');
  const t=await readTrade(env,input.address);trade=t;
  if(![t.userA,t.userB].includes(payer))throw new Error('Connect one of the two named trade wallets.');
  if(input.action==='recover'){
   if(!['settled','cancelled','closed'].includes(t.status))throw new Error('Use reclaim while the trade is open.');instructions=reclaimIxs(t,payer,true);
  }else{
   if(!['open','expired'].includes(t.status))throw new Error('This trade has already closed.');
   if(input.action==='fund')instructions=fundIxs(t,payer);
   else if(input.action==='reclaim')instructions=reclaimIxs(t,payer);
   else if(input.action==='cancel')instructions=rejectIxs(t,payer);
   else if(input.action==='settle'){
    if(t.status!=='open'||t.expiry<=Date.now()/1000+15)throw new Error('The settlement window has ended.');
    if(BigInt(t.balanceA)<BigInt(t.amountA)||BigInt(t.balanceB)<BigInt(t.amountB))throw new Error('Both legs must be fully funded.');
    instructions=settleIxs(t,payer);
   }else throw new Error('Unknown trade action.');
  }
 }
 const tx=await buildTransaction(c,payer,instructions);
 if(input.action==='settle')tx.partialSign(key);
 const serialized=Buffer.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})).toString('base64');
 // Simulate every prepared transaction without requiring the user's signature.
 const simulation=await fetch(env.RPC_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[serialized,{encoding:'base64',sigVerify:false,commitment:'confirmed'}]})}).then(r=>r.json()) as {result?:{value:{err:unknown;logs?:string[]}};error?:unknown};
 if(!simulation.result)throw new Error('Solana is unavailable. Please retry shortly.');
 if(simulation.result.value.err){
  const logs=simulation.result.value.logs?.join(' ')||'';
  if(/insufficient|no record of a prior credit|AccountNotFound/i.test(logs+JSON.stringify(simulation.result.value.err)))throw new Error('Insufficient SOL or token balance. Keep SOL available for network fees and account deposits.');
  throw new Error('The transaction could not be simulated. Check your balances and refresh the trade.');
 }
 return {transaction:serialized,trade,lastValidBlockHeight:tx.lastValidBlockHeight,blockhash:tx.recentBlockhash};
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/')){const res=await env.ASSETS.fetch(request);const headers=new Headers(res.headers);headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','strict-origin-when-cross-origin');headers.set('x-frame-options','DENY');headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');return new Response(res.body,{status:res.status,headers});}
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Origin is not allowed.'},403);
 if(env.RATE_LIMITER&&!(await env.RATE_LIMITER.limit({key:request.headers.get('cf-connecting-ip')||'local'})).success)return json({error:'Too many requests. Please wait a minute.'},429);
 try{
  if(url.pathname==='/api/config'&&request.method==='GET')return json({authority:authority(env).publicKey.toBase58(),program:PROGRAM.toBase58(),neiro:NEIRO,usdc:USDC,wsol:WSOL,network:'mainnet-beta'});
  if(url.pathname==='/api/health'){const genesis=await conn(env).getGenesisHash();return json({ok:true,network:genesis==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'?'mainnet-beta':'other',program:!!(await conn(env).getAccountInfo(PROGRAM))});}
  if(url.pathname==='/api/trades'&&request.method==='GET'){
   const wallet=url.searchParams.get('wallet');if(!isKey(wallet))return json({error:'Invalid wallet.'},400);
   const rows=await env.DB.prepare('SELECT data FROM trades WHERE seller=? OR buyer=? ORDER BY updated_at DESC LIMIT 30').bind(wallet,wallet).all<{data:string}>();return json({trades:rows.results.map(r=>JSON.parse(r.data))});
  }
  if(url.pathname.startsWith('/api/trade/')&&request.method==='GET'){const address=url.pathname.split('/').pop();if(!isKey(address))return json({error:'Invalid trade address.'},400);return json(await readTrade(env,address));}
  if(request.method==='POST'){
   const text=await request.text();if(text.length>20000)return json({error:'Request too large.'},413);const body=JSON.parse(text);
   if(url.pathname==='/api/prepare')return json(await prepare(env,body));
   if(url.pathname==='/api/rpc'){
    if(!body||Array.isArray(body)||!rpcMethods.has(body.method)||body.jsonrpc!=='2.0'||!Array.isArray(body.params))return json({error:'Unsupported RPC method.'},400);
    const res=await fetch(env.RPC_URL,{method:'POST',headers:{'content-type':'application/json'},body:text,signal:AbortSignal.timeout(20000)});
    return new Response(res.body,{status:res.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
   }
  }
  return json({error:'Not found.'},404);
 }catch(e){const msg=e instanceof Error?e.message:'Request failed.';const safe=/https?:\/\/|fetch failed|429|403|API.?key/i.test(msg)?'Solana connection is unavailable. Please retry shortly.':msg;return json({error:safe},400);}
}};
