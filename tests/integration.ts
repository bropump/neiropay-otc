import {Connection,Keypair,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import assert from 'node:assert/strict';import {Buffer} from 'buffer';import fs from 'node:fs';
import worker from '../worker/index';
import {NEIRO,USDC,WSOL,PROGRAM,ata,pk,derive,decode,createIx,fundIxs,settleIxs,reclaimIxs,rejectIxs,buildTransaction,type Trade,type Terms} from '../src/chain';
const url='http://127.0.0.1:18899',c=new Connection(url,'confirmed');
const a=Keypair.generate(),b=Keypair.generate(),auth=Keypair.generate(),attacker=Keypair.generate();
const logs:{name:string;pass:boolean;signature?:string}[]=[];
async function rpc(method:string,params:unknown[]){const j=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json()) as any;if(j.error)throw new Error(JSON.stringify(j.error));return j.result;}
for(const k of [a,b,auth,attacker])await rpc('surfnet_setAccount',[k.publicKey.toBase58(),{lamports:100_000_000_000}]);
for(const k of [a,b])for(const mint of [NEIRO,USDC])await rpc('surfnet_setTokenAccount',[k.publicKey.toBase58(),mint,{amount:10_000_000_000_000}]);
const memory=new Map<string,string>();
const env={RPC_URL:url,SETTLEMENT_SECRET:JSON.stringify(Array.from(auth.secretKey)),DB:{prepare(sql:string){let args:unknown[]=[];return {bind(...v:unknown[]){args=v;return this;},async run(){if(sql.startsWith('INSERT'))memory.set(args[0] as string,args[3] as string);return {};},async first(){return memory.has(args[0] as string)?{data:memory.get(args[0] as string)}:null;},async all(){return {results:[]};}};}}} as any;
const origin='http://test.local';
async function api(path:string,body?:unknown){const response=await worker.fetch(new Request(origin+'/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined),env);const data=await response.json() as any;if(!response.ok)throw new Error(data.error);return data;}
async function execute(action:string,payer:Keypair,extra:Record<string,unknown>){const p=await api('prepare',{action,payer:payer.publicKey.toBase58(),...extra});const tx=Transaction.from(Buffer.from(p.transaction,'base64'));tx.partialSign(payer);assert.equal(tx.verifySignatures(),true);const sig=await c.sendRawTransaction(tx.serialize());await c.confirmTransaction({signature:sig,blockhash:p.blockhash,lastValidBlockHeight:p.lastValidBlockHeight},'confirmed');return {...p,sig};}
async function balance(mint:string,owner:string){try{return BigInt((await c.getTokenAccountBalance(ata(mint,owner))).value.amount);}catch{return 0n;}}
for(const payment of ['USDC','SOL']){
 const p=await execute('create',a,{side:'sell',payment,neiro:'100000',total:payment==='USDC'?'25':'0.1',counterparty:b.publicKey.toBase58(),duration:1});const address=p.trade.address;
 const before=await api('trade/'+address);assert.equal(before.status,'open');
 await assert.rejects(()=>api('prepare',{action:'settle',payer:a.publicKey.toBase58(),address}),/Both legs/);
 await assert.rejects(()=>api('prepare',{action:'fund',payer:attacker.publicKey.toBase58(),address}),/named/);
 await execute('fund',a,{address});await execute('fund',b,{address});
 const funded=await api('trade/'+address);assert.equal(funded.balanceA,'100000000000');assert.equal(funded.balanceB,payment==='USDC'?'25000000':'100000000');
 await assert.rejects(()=>api('prepare',{action:'fund',payer:a.publicKey.toBase58(),address}),/already fully funded/);
 const neiroBefore=await balance(NEIRO,b.publicKey.toBase58()),cashBefore=await balance(payment==='USDC'?USDC:WSOL,a.publicKey.toBase58());
 const done=await execute('settle',a,{address});assert.equal(await c.getAccountInfo(pk(address)),null);
 assert.equal(await balance(NEIRO,b.publicKey.toBase58())-neiroBefore,100000000000n);assert.equal(await balance(payment==='USDC'?USDC:WSOL,a.publicKey.toBase58())-cashBefore,payment==='USDC'?25000000n:100000000n);
 const receipt=await api('trade/'+address);assert.equal(receipt.status,'settled');assert.equal(receipt.signature,done.sig);logs.push({name:`${payment}: create → both deposits → authority co-sign → exact atomic payouts and receipt`,pass:true,signature:done.sig});
 // Return a late deposit through RecoverDvp, using the same stored terms.
 await rpc('surfnet_setTokenAccount',[address,NEIRO,{amount:123456}]);
 const prior=await balance(NEIRO,a.publicKey.toBase58());const tx=await buildTransaction(c,a.publicKey.toBase58(),reclaimIxs(p.trade,a.publicKey.toBase58(),true));await sendAndConfirmTransaction(c,tx,[a],{commitment:'confirmed'});assert.equal(await balance(NEIRO,a.publicKey.toBase58())-prior,123456n);logs.push({name:`${payment}: recover a late deposit after closure`,pass:true});
}
const p=await execute('create',a,{side:'buy',payment:'USDC',neiro:'2000',total:'1',counterparty:b.publicKey.toBase58(),duration:1});const address=p.trade.address;
await execute('fund',a,{address});await execute('fund',b,{address});await execute('reclaim',b,{address});
await assert.rejects(()=>api('prepare',{action:'settle',payer:a.publicKey.toBase58(),address}),/Both legs/);
const before=await balance(USDC,a.publicKey.toBase58());await execute('cancel',a,{address});assert.equal(await balance(USDC,a.publicKey.toBase58())-before,1000000n);assert.equal(await c.getAccountInfo(pk(address)),null);logs.push({name:'Buy direction, reclaim before settlement, underfunding rejection, and full cancellation refund',pass:true});
await assert.rejects(()=>api('prepare',{action:'create',payer:a.publicKey.toBase58(),side:'sell',payment:'USDC',neiro:'0.0000001',total:'1',counterparty:b.publicKey.toBase58(),duration:1}),/decimal/);
logs.push({name:'Reject invalid precision and unauthorized wallet actions',pass:true});
fs.writeFileSync('tests/integration-results.json',JSON.stringify({network:'local Surfpool mainnet fork',program:PROGRAM.toBase58(),tests:logs},null,2));console.log(JSON.stringify(logs,null,2));
