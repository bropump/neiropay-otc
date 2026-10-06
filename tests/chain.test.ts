import test from 'node:test';import assert from 'node:assert/strict';
import {Keypair,SystemProgram} from '@solana/web3.js';import {Buffer} from 'buffer';
import {raw,units,NEIRO,USDC,PROGRAM,derive,decode,validateTerms,createIx,type Terms} from '../src/chain';
test('Token amounts preserve precision and reject invalid inputs',()=>{assert.equal(raw('9007199254.740993',6),9007199254740993n);assert.equal(units(9007199254740993n,6),'9007199254.740993');for(const s of ['0','-1','NaN','1e6','0.0000001','18446744073709551616'])assert.throws(()=>raw(s,6));});
test('Account verification rejects forged owner, data, addresses, and redirected proceeds',()=>{
 const a=Keypair.generate().publicKey.toBase58(),b=Keypair.generate().publicKey.toBase58(),authority=Keypair.generate().publicKey.toBase58();
 const t:Terms={address:'',userA:a,userB:b,mintA:NEIRO,mintB:USDC,authority,amountA:'1000000',amountB:'2000000',nonce:'18446744073709551615',expiry:Math.floor(Date.now()/1000)+3600,destinationA:a,destinationB:b,earliest:null};t.address=derive(t)[0].toBase58();
 validateTerms(t,authority);assert.throws(()=>validateTerms({...t,destinationA:b},authority));assert.throws(()=>validateTerms({...t,mintB:NEIRO},authority));assert.throws(()=>validateTerms({...t,authority:a},authority));assert.throws(()=>decode(t.address,{owner:SystemProgram.programId,data:Buffer.alloc(458),executable:false,lamports:1,rentEpoch:0}));assert.throws(()=>decode(t.address,{owner:PROGRAM,data:Buffer.alloc(457),executable:false,lamports:1,rentEpoch:0}));const ix=createIx(t,a);assert.equal(ix.data[0],0);assert.equal(Buffer.from(ix.data).readBigUInt64LE(25),18446744073709551615n);
});
