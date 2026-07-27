const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const dir = __dirname;
  const htmlPath = 'file://' + path.join(dir, 'arquitectura-tecnologias-doc.html').replace(/\\/g, '/');
  const out = path.join(dir, 'ARQUITECTURA-Y-TECNOLOGIAS.pdf');

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  console.log('PDF generado:', out);
})();
