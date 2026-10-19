import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
db.execute(sql.raw(process.argv[2])).then((r) => { console.table(r); process.exit(0); });
