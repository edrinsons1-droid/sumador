const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:8080');
    
    // Check if DOM element is found
    const btn = await page.$('#show-register-btn');
    console.log('Register Button Found:', !!btn);
    
    await browser.close();
})();
