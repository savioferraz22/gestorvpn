fetch('http://localhost:3000/api/admin/payments').then(r => r.json()).then(console.log).catch(console.error);
