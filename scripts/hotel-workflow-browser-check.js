async (page) => {
  const results=[]
  let sessionId
  page.on('request',request=>{
    if(request.url().endsWith('/api/hotel-workflow')) {
      const body=request.postDataJSON()
      if(body.action==='start')sessionId=body.sessionId
    }
  })
  async function state() {
    return page.evaluate(async id=>{
      const response=await fetch('/api/hotel-workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id,action:'read'})})
      return (await response.json()).state
    },sessionId)
  }
  async function send(text) {
    await page.waitForFunction(()=>!document.querySelector('.ch-send').disabled)
    const replies=await page.locator('.ch-bubble').count()
    await page.locator('#ch-message').fill(text)
    await page.getByRole('button',{name:'Send',exact:true}).click()
    await page.waitForFunction(n=>document.querySelectorAll('.ch-bubble').length>=n+2&&!document.querySelector('.ch-send').disabled,replies)
  }
  async function open(scenario) {
    await page.goto('http://127.0.0.1:4331/test?scenario='+scenario)
    await page.waitForFunction(()=>!document.querySelector('.ch-send').disabled)
    if(await page.locator('.ch-rehearsal').count())throw Error('Test controls visible in product UI')
  }
  const cases=[
    {scenario:'booking',text:'Hi, I’m Allen. Could you ask the hotel whether they have a twin room for two adults, December 5 to 7, 2026? Please check availability first.',operation:'book',status:'confirmed',checkIn:'2026-12-05',checkOut:'2026-12-07'},
    {scenario:'dates',text:'I’d like to ask about changing my December 5 to 7 reservation. Please move check-in to December 6, but keep it at two nights.',operation:'change_dates',status:'changed',checkIn:'2026-12-06',checkOut:'2026-12-08'},
    {scenario:'checkout',text:'Keep my check-in on December 5, but change checkout from December 7 to December 8.',operation:'change_checkout',status:'changed',checkIn:'2026-12-05',checkOut:'2026-12-08'},
    {scenario:'cancel',text:'I’m considering canceling my December 5 to 7 reservation. Can you check whether there’s a cancellation fee? Don’t cancel it yet.',operation:'cancel',status:'cancelled',checkIn:'2026-12-05',checkOut:'2026-12-07'},
  ]
  for(const item of cases) {
    await open(item.scenario)
    await send(item.text)
    const button=page.getByRole('button',{name:item.operation==='cancel'?'Confirm cancellation':'Confirm request',exact:true})
    await button.waitFor()
    const before=await state()
    if(before.status!=='awaiting_customer'||(before.booking&&before.booking.status!=='confirmed'))throw Error('Mutation before approval')
    if(before.offer.operation!==item.operation)throw Error('Wrong operation '+before.offer.operation)
    await button.click()
    await page.waitForFunction(()=>!document.querySelector('.ch-send').disabled)
    const after=await state()
    if(after.status!==item.status||after.booking.checkIn!==item.checkIn||after.booking.checkOut!==item.checkOut)throw Error('Saved result mismatch: '+JSON.stringify(after))
    results.push({scenario:after.scenario,status:after.status,booking:after.booking,audit:after.audit,reply:await page.locator('.ch-bubble').last().innerText()})
  }
  await open('luggage')
  await send('Could you ask whether the hotel can hold two suitcases after I check out on December 7? I’d leave them at 11 a.m. and collect them at 6 p.m.')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Hotel request"]')?.textContent.includes('Hotel response'))
  const luggage=await state()
  if(luggage.status!=='information_only'||luggage.offer!==null||luggage.booking.status!=='confirmed')throw Error('Storage falsely confirmed or booking mutated')
  results.push({scenario:'luggage',status:luggage.status,evidence:luggage.evidenceKo,reply:await page.locator('.ch-bubble').last().innerText()})
  await open('alternative')
  await send('Could you ask for a double room for two adults, December 6 to 8?')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Hotel request"]')?.textContent.includes('Another room'))
  const unavailable=await state()
  if(unavailable.offer!==null||unavailable.booking!==null)throw Error('Alternative was selected without consent')
  await send('A twin room is fine. Please check the total before booking.')
  await page.getByRole('button',{name:'Confirm request',exact:true}).waitFor()
  const alternative=await state()
  if(alternative.offer.stay.roomType!=='twin')throw Error('Wrong alternative')
  await page.getByRole('button',{name:'Keep unchanged',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('.ch-send').disabled)
  const declined=await state()
  if(declined.status!=='declined'||declined.booking!==null)throw Error('Declined request was booked')
  results.push({scenario:'alternative',status:declined.status,audit:declined.audit})
  return results
}
