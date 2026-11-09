import {createServerFn} from '@tanstack/react-start'

// Exposes capability only; no credentials or fixture data leave the server here.
export const getHotelWorkflowCapability=createServerFn({method:'GET'}).handler(async()=>{
 const {sandboxEnabled}=await import('./hotel-workflow.server')
 return {enabled:sandboxEnabled()}
})
