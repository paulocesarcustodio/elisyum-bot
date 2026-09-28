import { AsyncLocalStorage } from 'node:async_hooks'
export interface OperationContext {id:string; sequence:number; error?:string; rejected?:boolean}
export const operationContext = new AsyncLocalStorage<OperationContext>()
export const currentOperation = () => operationContext.getStore()
export class UncertainEffect extends Error {readonly code='UNCERTAIN_EFFECT'}
