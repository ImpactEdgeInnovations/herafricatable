import "server-only";
import { getServerPaymentEnv } from "@/lib/env";

type PaystackResponse<T>={status:boolean;message:string;data:T};
export type PaystackVerification={amount:number;currency:string;reference:string;status:string};

async function request<T>(path:string,init?:RequestInit){const {paystackSecretKey}=getServerPaymentEnv();const response=await fetch(`https://api.paystack.co${path}`,{...init,headers:{Authorization:`Bearer ${paystackSecretKey}`,"Content-Type":"application/json",...(init?.headers??{})},cache:"no-store"});const payload=await response.json() as PaystackResponse<T>;if(!response.ok||!payload.status)throw new Error(payload.message||"Paystack request failed");return payload.data}
export function initializePaystackTransaction(input:{email:string;amount:number;currency:string;reference:string;callbackUrl:string;metadata:Record<string,string>}){return request<{authorization_url:string;access_code:string;reference:string}>("/transaction/initialize",{method:"POST",body:JSON.stringify({email:input.email,amount:String(input.amount),currency:input.currency,reference:input.reference,callback_url:input.callbackUrl,metadata:input.metadata})})}
export function verifyPaystackTransaction(reference:string){return request<PaystackVerification>(`/transaction/verify/${encodeURIComponent(reference)}`)}
