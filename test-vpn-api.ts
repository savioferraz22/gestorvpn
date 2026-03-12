import fetch from "node-fetch";

async function test() {
  const VPN_API_URL = "https://pweb.cloudbrasil.shop/core/apiatlas.php";
  const VPN_API_KEY = "LTm2H0TnZwKY560Vqj7gfbxeIL";

  const params = new URLSearchParams();
  params.append("passapi", VPN_API_KEY);
  params.append("module", "userget");

  const vpnRes = await fetch(VPN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const textResponse = await vpnRes.text();
  const users = JSON.parse(textResponse);
  console.log("First user:", users[0]);
}

test();
