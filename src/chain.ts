import {Buffer} from 'buffer';
import {PublicKey,Transaction,TransactionInstruction,SystemProgram,ComputeBudgetProgram,Connection,type AccountInfo} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction,createSyncNativeInstruction,createCloseAccountInstruction} from '@solana/spl-token';
import idl from './dvp-idl.json';

export const PROGRAM=new PublicKey('dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq');
export const NEIRO='CTg3ZgYx79zrE1MteDVkmkcGniiFrK1hJ6yiabropump';
export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const WSOL='So11111111111111111111111111111111111111112';
export const MEMO=new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const pk=(s:string)=>new PublicKey(s);
export const ata=(mint:string,owner:string)=>getAssociatedTokenAddressSync(pk(mint),pk(owner),true);
export const short=(s:string)=>s?`${s.slice(0,5)}…${s.slice(-5)}`:'Not connected';
export function raw(s:string,decimals:number):bigint {
 if(!/^\d+(\.\d+)?$/.test(s)||s.length>40)throw new Error('Enter a positive token amount.');
 const [whole,frac='']=s.split('.');
 if(frac.length>decimals)throw new Error(`Use no more than ${decimals} decimal places.`);
 const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.padEnd(decimals,'0'));
 if(n<=0n||n>18446744073709551615n)throw new Error('Amount is outside the supported range.');return n;
}
export function units(n:string|bigint,decimals:number){const v=BigInt(n);const p=10n**BigInt(decimals);const f=(v%p).toString().padStart(decimals,'0').replace(/0+$/,'');return `${v/p}${f?'.'+f:''}`;}
export function display(n:string|bigint,decimals:number){const [a,b]=units(n,decimals).split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b?'.'+b:'');}
export const u64=(n:bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
export type Terms={address:string;userA:string;userB:string;mintA:string;mintB:string;authority:string;amountA:string;amountB:string;expiry:number;nonce:string;destinationA:string;destinationB:string;earliest:number|null};
export type Trade=Terms & {balanceA:string;balanceB:string;status:'open'|'expired'|'settled'|'cancelled'|'closed';signature?:string;updatedAt?:number};
export function derive(t:Pick<Terms,'authority'|'userA'|'userB'|'mintA'|'mintB'|'nonce'>){return PublicKey.findProgramAddressSync([Buffer.from('dvp'),...['authority','userA','userB','mintA','mintB'].map(k=>pk(t[k as keyof typeof t]).toBuffer()),u64(BigInt(t.nonce))],PROGRAM);}
export function decode(address:string,account:AccountInfo<Buffer>):Terms {
 if(!account.owner.equals(PROGRAM)||account.data.length!==458||account.executable)throw new Error('Unverified trade record.');
 const d=Buffer.from(account.data);let o=1;const key=()=>{const k=new PublicKey(d.subarray(o,o+32)).toBase58();o+=32;return k;};
 const userA=key(),userB=key(),mintA=key(),mintB=key(),authority=key(),programA=key(),programB=key();
 const amountA=d.readBigUInt64LE(o).toString();o+=8;const amountB=d.readBigUInt64LE(o).toString();o+=8;const expiry=Number(d.readBigInt64LE(o));o+=8;const nonce=d.readBigUInt64LE(o).toString();o+=8+64;
 const destinationA=key(),destinationB=key();o+=64;
 if(d[o]!==0&&d[o]!==1)throw new Error('Invalid settlement time encoding.');
 const earliest=d[o]===1?Number(d.readBigInt64LE(o+1)):null;
 const t={address,userA,userB,mintA,mintB,authority,amountA,amountB,expiry,nonce,destinationA,destinationB,earliest};
 const [expected,bump]=derive(t);
 if(expected.toBase58()!==address||d[0]!==bump||programA!==TOKEN_PROGRAM_ID.toBase58()||programB!==TOKEN_PROGRAM_ID.toBase58())throw new Error('Trade address or token program mismatch.');
 return t;
}
export function validateTerms(t:Terms,authority:string){
 if(t.authority!==authority||t.mintA!==NEIRO||![USDC,WSOL].includes(t.mintB)||t.userA===t.userB||[t.userA,t.userB].includes(authority)||t.destinationA!==t.userA||t.destinationB!==t.userB||BigInt(t.amountA)<=0n||BigInt(t.amountB)<=0n||t.earliest!==null)throw new Error('This trade does not match the NEIRO OTC settlement policy.');
 if(!PublicKey.isOnCurve(pk(t.userA).toBytes())||!PublicKey.isOnCurve(pk(t.userB).toBytes()))throw new Error('This version supports standard Solana wallets.');
}
function instruction(name:keyof typeof idl,accounts:Record<string,PublicKey>,data?:Buffer){
 const def=idl[name];return new TransactionInstruction({programId:PROGRAM,keys:def.accounts.map(a=>{if(!accounts[a.name])throw new Error(`Missing ${a.name}`);return {pubkey:accounts[a.name],isSigner:a.isSigner,isWritable:a.isWritable};}),data:data??Buffer.from([def.discriminator,...(name==='settleDvp'||name==='rejectDvp'?[0]:[])])});
}
function accounts(t:Terms,payer:string){return {payer:pk(payer),signer:pk(payer),swapDvp:pk(t.address),nonceTombstone:PublicKey.findProgramAddressSync([Buffer.from('nonce'),pk(t.address).toBuffer()],PROGRAM)[0],settlementAuthority:pk(t.authority),userA:pk(t.userA),userB:pk(t.userB),mintA:pk(t.mintA),mintB:pk(t.mintB),dvpAtaA:ata(t.mintA,t.address),dvpAtaB:ata(t.mintB,t.address),userADestinationAtaB:ata(t.mintB,t.userA),userBDestinationAtaA:ata(t.mintA,t.userB),userAAtaA:ata(t.mintA,t.userA),userBAtaB:ata(t.mintB,t.userB),systemProgram:SystemProgram.programId,tokenProgramA:TOKEN_PROGRAM_ID,tokenProgramB:TOKEN_PROGRAM_ID,associatedTokenProgram:ASSOCIATED_TOKEN_PROGRAM_ID,memoProgram:MEMO};}
export function createIx(t:Terms,payer:string){
 const ref=Buffer.from('NEIROPAY-OTC-V1');const len=Buffer.alloc(4);len.writeUInt32LE(ref.length);
 return instruction('createDvp',accounts(t,payer),Buffer.concat([Buffer.from([0]),u64(BigInt(t.amountA)),u64(BigInt(t.amountB)),u64(BigInt(t.expiry)),u64(BigInt(t.nonce)),Buffer.from([1]),len,ref,Buffer.from([0,0,0])]));
}
export function ensureAta(payer:string,mint:string,owner:string){return createAssociatedTokenAccountIdempotentInstruction(pk(payer),ata(mint,owner),pk(owner),pk(mint));}
export function settleIxs(t:Terms,payer:string){return [ensureAta(payer,t.mintA,t.userA),ensureAta(payer,t.mintB,t.userB),ensureAta(payer,t.mintB,t.userA),ensureAta(payer,t.mintA,t.userB),instruction('settleDvp',accounts(t,payer))];}
export function rejectIxs(t:Terms,payer:string){if(![t.userA,t.userB].includes(payer))throw new Error('Only a trade participant can cancel.');return [ensureAta(payer,t.mintA,t.userA),ensureAta(payer,t.mintB,t.userB),instruction('rejectDvp',accounts(t,payer))];}
export function reclaimIxs(t:Terms,payer:string,recover=false){
 if(![t.userA,t.userB].includes(payer))throw new Error('Only a trade participant can reclaim.');
 const mint=payer===t.userA?t.mintA:t.mintB;
 return [ensureAta(payer,mint,payer),instruction(recover?'recoverDvp':'reclaimDvp',{...accounts(t,payer),mint:pk(mint),dvpSourceAta:ata(mint,t.address),dvpEscrowAta:ata(mint,t.address),signerDestAta:ata(mint,payer),tokenProgram:TOKEN_PROGRAM_ID},recover?Buffer.concat([Buffer.from([5]),pk(t.authority).toBuffer(),pk(t.userA).toBuffer(),pk(t.userB).toBuffer(),pk(t.mintA).toBuffer(),pk(t.mintB).toBuffer(),u64(BigInt(t.nonce))]):undefined)];
}
export function fundIxs(t:Trade,payer:string){
 if(![t.userA,t.userB].includes(payer))throw new Error('Only the named participant can fund this leg.');
 if(t.status!=='open'||t.expiry<=Math.floor(Date.now()/1000)+60)throw new Error('The trade is closed or too close to expiry.');
 const isA=payer===t.userA,mint=isA?t.mintA:t.mintB,amount=BigInt(isA?t.amountA:t.amountB)-BigInt(isA?t.balanceA:t.balanceB);
 if(amount<=0n)throw new Error('Your leg is already fully funded.');
 if(mint===WSOL)return [SystemProgram.transfer({fromPubkey:pk(payer),toPubkey:ata(mint,t.address),lamports:amount}),createSyncNativeInstruction(ata(mint,t.address))];
 return [createTransferCheckedInstruction(ata(mint,payer),pk(mint),ata(mint,t.address),pk(payer),amount,6)];
}
export function unwrapIx(payer:string){return createCloseAccountInstruction(ata(WSOL,payer),pk(payer),pk(payer));}
export async function buildTransaction(connection:Connection,payer:string,ixs:TransactionInstruction[]){
 const latest=await connection.getLatestBlockhash('confirmed');
 return new Transaction({feePayer:pk(payer),...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:350000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),...ixs);
}
