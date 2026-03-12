import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  console.log("Testing Supabase connection...");
  
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error("Error listing buckets:", bucketError.message);
    return;
  }
  
  const backupBucket = buckets.find(b => b.name === 'sqlite_backup');
  if (!backupBucket) {
    console.error("Bucket 'sqlite_backup' not found! Please create it.");
    return;
  }
  console.log("Bucket 'sqlite_backup' found.");

  console.log("Testing upload...");
  const { error: uploadError } = await supabase.storage.from('sqlite_backup').upload('test.txt', 'Hello World', { upsert: true });
  if (uploadError) {
    console.error("Error uploading to bucket:", uploadError.message);
    return;
  }
  console.log("Upload successful.");

  console.log("All tests passed! Supabase is configured correctly.");
}

test();
