// Called only with temporary synthetic sessions. Never records tokens, traces or screenshots.
import {chromium} from 'playwright';
export async function verifyFinanceBrowser({ref,sessions}) {
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1280,390]) {
      const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      try {
        const page=await context.newPage();
        await page.goto('https://stevenpisani.com/apps/#finance');
        await page.locator('#app[data-state="out"]').waitFor();
        if(await page.locator('#finance-content .finance-amount').count())throw Error('Anonymous Finance display');
        const signIn=async session=>{
          await page.evaluate(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session});
          await page.reload();
        };
        await signIn(sessions[0]);
        await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
        if(!(await page.locator('#finance-content').innerText()).includes('Synthetic checking'))throw Error('Missing synthetic account');
        if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Finance overflow');
        const downloadEvent=page.waitForEvent('download');
        await page.getByRole('button',{name:'Export backup'}).click();
        const download=await downloadEvent;
        const stream=await download.createReadStream();let backup='';for await(const chunk of stream)backup+=chunk;
        const parsed=JSON.parse(backup);
        if(parsed.accounts.length!==1||parsed.accounts[0].source_key!=='synthetic-live'||parsed.transactions.length!==1)throw Error('Incorrect backup');
        const persisted=await page.evaluate(async()=>{
          if(JSON.stringify(localStorage).includes('Synthetic checking'))return true;
          for(const name of await caches.keys())for(const req of await (await caches.open(name)).keys())if(/finance_(accounts|transactions|plans|budgets|tax_scenarios)/.test(req.url))return true;
          return false;
        });
        if(persisted)throw Error('Persisted Finance data');
        await context.setOffline(true);
        await page.waitForFunction(()=>!document.querySelector('#finance-content .finance-amount'));
        await context.setOffline(false);
        await page.reload();
        await page.getByRole('heading',{name:'Available after reserves'}).waitFor();
        await page.click('#app-me');
        page.once('dialog',d=>d.accept());
        await page.click('#app-signout');
        await page.locator('#app[data-state="out"]').waitFor();
        if((await page.locator('#finance-content').innerText()).includes('Synthetic checking'))throw Error('Finance survived logout');
        await signIn(sessions[1]);
        await page.getByText('No funding plan for this year. Import a reviewed plan to begin.').waitFor();
        if((await page.locator('#finance-content').innerText()).includes('Synthetic checking'))throw Error('Cross-owner display');
      } finally {await context.close();}
    }
  } finally {await browser.close();}
  console.log('Deployed Finance browser: desktop/phone, anonymous gate, backup, cache, offline clearing, sign-out and owner change passed.');
}
