import fetch from "node-fetch";

async function test() {
  const username = "Savio7";
  const newDate = "2026-06-16";
  
  const res = await fetch("http://localhost:3000/api/date-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, newDate })
  });
  
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

test();
