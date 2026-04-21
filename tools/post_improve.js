import fs from 'fs/promises';

async function main(){
  const article = await fs.readFile('./data/sample_article.txt', 'utf8');
  const question = 'Why are leveraged FX investments considered risky in pension schemes?';
  const original = `Leveraged FX investments are considered risky due to their potential for significant losses. 1 Consult a financial advisor 2 Review pension scheme documentation 3 Assess personal risk tolerance Tip It's essential to understand the risks before making investment decisions`;

  const resp = await fetch('http://localhost:3000/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article, question, original })
  });

  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
