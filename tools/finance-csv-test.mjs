import assert from 'node:assert/strict';
import {parseFinanceCsv,readCsv,csvInfo} from '../supabase/functions/_shared/finance-csv.js';
const td='Date,Description,Debit,Credit,Bank RTN,Account Number\n2026-01-02,"Cafe, Example",12.34,,SECRET,SECRET\n2026-01-02,"Cafe, Example",12.34,,SECRET,SECRET\n2026-01-03,Refund,,2.34,SECRET,SECRET';
const a=await parseFinanceCsv(td,{accountKey:'checking'}),b=await parseFinanceCsv(td,{accountKey:'checking'});
assert.deepEqual(a,b);assert.equal(a.payload.transactions.length,3);assert.equal(a.payload.transactions[0].amount_cents,-1234);assert.equal(a.payload.transactions[2].amount_cents,234);
assert.notEqual(a.payload.transactions[0].source_key,a.payload.transactions[1].source_key);assert.ok(!JSON.stringify(a).includes('SECRET'));
const lili='Timestamp,Amount,Settlement Currency,Merchant Name,Status,Category\n2026-01-01 12:00:00,125.25,USD,Example,SETTLED,Income\n2026-01-02 12:00:00,-5,USD,Pending,PENDING,Food';
const l=await parseFinanceCsv(lili,{accountKey:'business'});assert.equal(l.skippedPending,1);assert.equal(l.payload.transactions[0].treatment,'review');
const monarch='Date,Merchant,Category,Account,Amount\n2026-01-01,Example,Food,One,-10\n2026-01-02,Other,Food,Two,-20';
assert.deepEqual(csvInfo(monarch).accounts,['One','Two']);assert.equal((await parseFinanceCsv(monarch,{accountKey:'one',sourceAccount:'One'})).payload.transactions.length,1);
for(const text of ['a,b\n"broken,b','a,b\n1,2,3'])assert.throws(()=>readCsv(text));
await assert.rejects(()=>parseFinanceCsv(lili.replace('USD','EUR'),{accountKey:'business'}),/non-USD/);
await assert.rejects(()=>parseFinanceCsv(td.replace('12.34','12.345'),{accountKey:'checking'}),/dollar/);
await assert.rejects(()=>parseFinanceCsv(td.replace('2026-01-02','2026-02-30'),{accountKey:'checking'}),/date/);
await assert.rejects(()=>parseFinanceCsv(td.replace('SECRET,SECRET','SECRET,SECOND'),{accountKey:'checking'}),/one TD account/);
console.log('Finance CSV: TD, Lili, Monarch, signed cents, repeat purchases, malformed rows and omitted bank identifiers passed.');

const tdUnquoted='Date,Bank RTN,Account Number,Transaction Type,Description,Debit,Credit,Check Number,Account Running Balance\n2026-01-02,SECRET,SECRET,DEBIT,Example, Incorporated,12.34,,,100.00';
const unquoted=await parseFinanceCsv(tdUnquoted,{accountKey:'checking'});assert.equal(unquoted.payload.transactions[0].description,'Example, Incorporated');assert.equal(unquoted.payload.transactions[0].amount_cents,-1234);
