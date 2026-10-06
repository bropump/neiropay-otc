import {createAppKit} from '@reown/appkit/react';
import {SolanaAdapter} from '@reown/appkit-adapter-solana/react';
import {solana} from '@reown/appkit/networks';
export const appkit=createAppKit({
 adapters:[new SolanaAdapter()],networks:[solana],defaultNetwork:solana,
 projectId:import.meta.env.VITE_REOWN_PROJECT_ID,
 metadata:{name:'NEIRO OTC · NeiroPay',description:'Bilateral NEIRO Bropump trades, settled together on Solana.',url:window.location.origin,icons:[`${window.location.origin}/favicon.svg`]},
 themeMode:'dark',themeVariables:{'--w3m-accent':'#f99d46','--w3m-border-radius-master':'2px'},
 features:{analytics:false,email:false,socials:false,swaps:false,onramp:false},
});
