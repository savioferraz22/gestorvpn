fetch("http://localhost:3000/api/admin/date-changes").then(r => r.json()).then(async reqs => {
  console.log("Requests:", reqs);
  if (reqs.length > 0) {
    const id = reqs[0].id;
    console.log("Approving request", id);
    const res = await fetch(`http://localhost:3000/api/admin/date-changes/${id}/approve`, { method: "POST" });
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  }
}).catch(console.error);
