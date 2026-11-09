import test from 'node:test'
import assert from 'node:assert/strict'
import {newWorkflow,inquireHotel,decideHotel} from '../src/lib/hotel-workflow.ts'
const make=(scenario='booking')=>newWorkflow('00000000-0000-4000-a000-000000000001',scenario)
function approved(s){return decideHotel(s,s.offer.id,s.version,true)}
test('booking inquiry does not book; approval writes once',()=>{
 const original=make();const q=inquireHotel(original,{operation:'book'});
 assert.equal(original.version,0);assert.equal(q.booking,null);assert.equal(q.status,'awaiting_customer');
 const done=approved(q);assert.equal(done.status,'confirmed');assert.equal(done.booking.total,280000);
 assert.equal(decideHotel(done,q.offer.id,q.version,true),done);
});
test('date change preserves two nights and existing booking until approval',()=>{
 const q=inquireHotel(make('dates'),{operation:'change_dates',checkIn:'2026-12-06'});
 assert.equal(q.booking.checkIn,'2026-12-05');assert.equal(q.offer.stay.checkOut,'2026-12-08');
 const done=approved(q);assert.equal(done.status,'changed');assert.equal(done.booking.checkIn,'2026-12-06');
});
test('checkout-only changes check-out to Dec 8, charges three nights',()=>{
 const q=inquireHotel(make('checkout'),{operation:'change_checkout',checkOut:'2026-12-08'});
 assert.equal(q.offer.stay.checkIn,'2026-12-05');assert.equal(q.offer.total,420000);
 assert.equal(approved(q).booking.checkOut,'2026-12-08');
});
test('checkout-only rejects accidental check-in change',()=>{
 const q=inquireHotel(make('checkout'),{operation:'change_checkout',checkIn:'2026-12-06',checkOut:'2026-12-08'});
 assert.equal(q.status,'needs_details');assert.equal(q.offer,null);
});
test('cancellation requires approval and preserves stored dates',()=>{
 const q=inquireHotel(make('cancel'),{operation:'cancel',checkIn:'2099-01-01'});
 assert.equal(q.booking.status,'confirmed');assert.equal(q.offer.stay.checkIn,'2026-12-05');
 assert.equal(approved(q).booking.status,'cancelled');
});
test('declining cancellation leaves booking untouched',()=>{
 const q=inquireHotel(make('cancel'),{operation:'cancel'});
 const result=decideHotel(q,q.offer.id,q.version,false);
 assert.equal(result.status,'declined');assert.equal(result.booking.status,'confirmed');
 assert.throws(()=>decideHotel(result,q.offer.id,result.version,true));
});
test('luggage remains information only with no booking mutation',()=>{
 const initial=make('luggage');const q=inquireHotel(initial,{operation:'luggage',bags:2,dropOff:'11:00',pickUp:'18:00'});
 assert.deepEqual(q.booking,initial.booking);assert.equal(q.status,'information_only');assert.equal(q.offer,null);
 assert.match(q.evidenceKo,/확정은 아닙니다/);
});
for(const dropOff of ['99:00','12:99','18:00'])test(`invalid storage time ${dropOff}`,()=>{
 assert.equal(inquireHotel(make('luggage'),{operation:'luggage',bags:2,dropOff,pickUp:'18:00'}).status,'needs_details');
});
test('double unavailable, only chosen twin becomes approvable',()=>{
 const q=inquireHotel(make('alternative'),{operation:'book',checkIn:'2026-12-06',checkOut:'2026-12-08',roomType:'double'});
 assert.equal(q.status,'unavailable');assert.equal(q.offer,null);
 const twin=inquireHotel(q,{operation:'book',roomType:'twin'});
 assert.equal(twin.offer.stay.checkIn,'2026-12-06');assert.equal(approved(twin).booking.roomType,'twin');
});
test('invalid correction revokes earlier offer',()=>{
 const q=inquireHotel(make(),{operation:'book'});
 const invalid=inquireHotel(q,{operation:'book',checkOut:'2026-12-01'});
 assert.equal(invalid.offer,null);assert.throws(()=>decideHotel(invalid,q.offer.id,invalid.version,true));
});
test('old quote or version cannot approve newer terms',()=>{
 const first=inquireHotel(make(),{operation:'book'});const second=inquireHotel(first,{operation:'book',checkOut:'2026-12-08'});
 assert.throws(()=>decideHotel(second,first.offer.id,first.version,true));
 assert.throws(()=>decideHotel(second,second.offer.id,first.version,true));
});
test('cannot cancel or change a missing or cancelled booking',()=>{
 assert.equal(inquireHotel(make(),{operation:'cancel'}).status,'needs_details');
 const cancelled=approved(inquireHotel(make('cancel'),{operation:'cancel'}));
 assert.equal(inquireHotel(cancelled,{operation:'change_dates',checkIn:'2026-12-06'}).status,'needs_details');
});
test('a second booking cannot duplicate the active reservation',()=>{
 const first=approved(inquireHotel(make(),{operation:'book'}));
 assert.equal(inquireHotel(first,{operation:'book'}).status,'needs_details');
});

test('choosing an alternative during a date change preserves corrected dates',()=>{
 const q=inquireHotel(make('dates'),{operation:'change_dates',checkIn:'2026-12-06',roomType:'double'});
 assert.equal(q.status,'unavailable');
 const twin=inquireHotel(q,{operation:'change_dates',roomType:'twin'});
 assert.equal(twin.offer.stay.checkIn,'2026-12-06');assert.equal(twin.offer.stay.checkOut,'2026-12-08');
});
test('available dates can be queried without choosing dates or making a booking',()=>{
 const q=inquireHotel(make(),{operation:'availability'});
 assert.equal(q.status,'information_only');assert.equal(q.offer,null);assert.equal(q.booking,null);
 assert.deepEqual(q.availability.options.map(x=>[x.checkIn,x.checkOut]),[['2026-12-05','2026-12-07'],['2026-12-06','2026-12-08']]);
});
test('availability respects duration, room type and search window',()=>{
 const q=inquireHotel(make(),{operation:'availability',roomType:'double',stayNights:2});
 assert.equal(q.availability.options.length,1);assert.equal(q.availability.options[0].checkIn,'2026-12-05');
 const filtered=inquireHotel(make(),{operation:'availability',fromDate:'2026-12-06',throughDate:'2026-12-06',stayNights:1});
 assert.deepEqual(filtered.availability.options.map(x=>x.checkOut),['2026-12-07']);
});
test('outside known inventory does not invent dates or claim full occupancy',()=>{
 const q=inquireHotel(make(),{operation:'availability',fromDate:'2027-01-01',throughDate:'2027-01-31'});
 assert.equal(q.availability.options.length,0);assert.match(q.evidenceKo,/범위 밖 날짜는 확인되지/);assert.equal(q.offer,null);
});
test('availability never mutates an existing reservation',()=>{
 const initial=make('dates');const q=inquireHotel(initial,{operation:'availability',stayNights:1});
 assert.deepEqual(q.booking,initial.booking);assert.equal(q.offer,null);
});
test('selected availability option becomes an offer, not an automatic booking',()=>{
 const q=inquireHotel(make(),{operation:'availability'});
 const chosen=inquireHotel(q,{operation:'book',checkIn:'2026-12-06'});
 assert.equal(chosen.offer.stay.checkOut,'2026-12-08');assert.equal(chosen.booking,null);
 assert.equal(approved(chosen).booking.checkOut,'2026-12-08');
});
for(const patch of [{stayNights:0},{stayNights:1.5},{fromDate:'2026-02-30'},{fromDate:'2026-12-08',throughDate:'2026-12-05'}])test(`invalid availability query ${JSON.stringify(patch)}`,()=>{
 const q=inquireHotel(make(),{operation:'availability',...patch});assert.equal(q.status,'needs_details');assert.equal(q.offer,null);
});
