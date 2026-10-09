export interface WalletChoice {id:string;name:string;provider:{request(request:{method:string;params?:unknown[]}):Promise<unknown>};}
export declare function startWalletDiscovery(target?:any):void;
export declare function requestWalletDiscovery(target?:any):void;
export declare function availableWallets(target?:any):WalletChoice[];
export declare function chooseWalletProvider(provider:any):any;
export declare function activeWalletProvider(target?:any):any;
export declare function clearWalletProvider():void;
export declare function mobileWalletLinks(url:string):{metamask:string;trust:string;page:string}|null;
