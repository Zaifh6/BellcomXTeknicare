import fs from 'fs/promises';

async function main(){
  const question = 'Can investment funds be transferred to other bank accounts?';
  const body = { message: question };
  const r = await fetch('http://localhost:3000/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const j = await r.json();
  console.log(JSON.stringify(j, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
