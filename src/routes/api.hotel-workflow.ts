import {createFileRoute} from '@tanstack/react-router'
export const Route=createFileRoute('/api/hotel-workflow')({server:{handlers:{POST:async({request})=>{
 const {handleHotelWorkflow}=await import('../lib/hotel-workflow.server')
 return handleHotelWorkflow(request)
}}}})
