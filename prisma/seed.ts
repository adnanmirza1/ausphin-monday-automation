import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  SYSTEM_ROLES,
  DEFAULT_STATUS_LABELS,
} from "../src/lib/constants";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const db = new PrismaClient({ adapter });

const DEPARTMENTS = [
  { name: "Sales", color: "#2D6CDF" },
  { name: "Visa", color: "#0B7A6F" },
  { name: "Documents", color: "#8E44AD" },
  { name: "Finance", color: "#C67A1E" },
  { name: "HR", color: "#E06A9C" },
  { name: "Creatives", color: "#E2B93B" },
  { name: "Accounts", color: "#5D6D7E" },
];

async function main() {
  console.log("Seeding…");

  // Wipe (dev only) — order respects FKs via cascade from Organization.
  await db.organization.deleteMany();

  const org = await db.organization.create({
    data: { name: "Oswin / Osphine" },
  });

  // Roles
  const roles: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const role = await db.role.create({
      data: {
        orgId: org.id,
        name: r.name,
        color: r.color,
        rank: r.rank,
        isSystem: true,
        permissions: JSON.stringify(r.permissions),
      },
    });
    roles[r.name] = role.id;
  }

  // Departments
  const depts: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const dep = await db.department.create({
      data: { orgId: org.id, name: d.name, color: d.color },
    });
    depts[d.name] = dep.id;
  }

  // Users
  const pw = await bcrypt.hash("password", 10);
  const admin = await db.user.create({
    data: {
      orgId: org.id,
      email: "adnan.mustafa@toptal.com",
      name: "Adnan Mustafa",
      passwordHash: pw,
      avatarColor: "#C0392B",
      status: "active",
      roleId: roles["Admin"],
      departmentId: depts["Sales"],
    },
  });

  const members = [
    { email: "gem@oswin.co", name: "Gem Cruz", role: "Member", dept: "Sales", color: "#0B7A6F" },
    { email: "rowena@oswin.co", name: "Rowena Diaz", role: "Member", dept: "Visa", color: "#2D6CDF" },
    { email: "annie@oswin.co", name: "Annie Santos", role: "Member", dept: "Finance", color: "#C67A1E" },
    { email: "tasha@oswin.co", name: "Tasha Lim", role: "Developer", dept: "Documents", color: "#8E44AD" },
    { email: "demo@oswin.co", name: "Demo Trainee", role: "Viewer", dept: "Creatives", color: "#5B7A99" },
  ];
  const userIds: Record<string, string> = { [admin.email]: admin.id };
  for (const m of members) {
    const u = await db.user.create({
      data: {
        orgId: org.id,
        email: m.email,
        name: m.name,
        passwordHash: pw,
        avatarColor: m.color,
        status: m.role === "Viewer" ? "viewer" : "active",
        roleId: roles[m.role],
        departmentId: depts[m.dept],
      },
    });
    userIds[m.email] = u.id;
  }

  // Environments
  const envPty = await db.environment.create({
    data: { orgId: org.id, name: "Osphine PTY", color: "#0B7A6F", position: 0 },
  });
  await db.environment.create({
    data: { orgId: org.id, name: "Osphine Institute", color: "#2D6CDF", position: 1 },
  });
  await db.environment.create({
    data: { orgId: org.id, name: "Demo", color: "#C67A1E", position: 2 },
  });

  // Sample Sales board
  const board = await db.board.create({
    data: {
      environmentId: envPty.id,
      name: "Sales Board",
      description: "Candidate pipeline — lead to qualified.",
      position: 0,
    },
  });

  const groups = await Promise.all(
    [
      { name: "New Leads", color: "#2D6CDF", position: 0 },
      { name: "Contacting", color: "#E2B93B", position: 1 },
      { name: "Qualified", color: "#0B7A6F", position: 2 },
      { name: "Done", color: "#2E9C63", position: 3 },
    ].map((g) => db.group.create({ data: { boardId: board.id, ...g } }))
  );

  const programLabels = JSON.stringify({
    labels: [
      { id: "sap400", label: "SAP 400", color: "#2D6CDF" },
      { id: "sap407", label: "SAP 407", color: "#0B7A6F" },
      { id: "sap482", label: "SAP 482", color: "#8E44AD" },
      { id: "gap", label: "GAP", color: "#C67A1E" },
    ],
  });

  const columns = await Promise.all(
    [
      { name: "Status", type: "status", position: 0, config: JSON.stringify({ labels: DEFAULT_STATUS_LABELS }) },
      { name: "Owner", type: "person", position: 1, config: "{}" },
      { name: "Program", type: "status", position: 2, config: programLabels },
      { name: "Email", type: "email", position: 3, config: "{}" },
      { name: "Phone", type: "phone", position: 4, config: "{}" },
      { name: "Entry Date", type: "date", position: 5, config: "{}" },
    ].map((c) => db.column.create({ data: { boardId: board.id, ...c } }))
  );

  const col = (name: string) => columns.find((c) => c.name === name)!;

  // Sample items with cells
  const sampleItems = [
    { name: "Maverick Estacio", group: 0, status: "new", owner: "gem@oswin.co", program: "sap400", email: "maverick@gmail.com", phone: "+61 400 111 222", date: "2026-07-01" },
    { name: "One Delacroix", group: 1, status: "working", owner: "gem@oswin.co", program: "sap407", email: "one.d@gmail.com", phone: "+61 400 333 444", date: "2026-06-28" },
    { name: "Abdul Hamad", group: 1, status: "working", owner: "rowena@oswin.co", program: "sap482", email: "abdul.h@gmail.com", phone: "+61 400 555 666", date: "2026-06-25" },
    { name: "Francisco Eddily", group: 2, status: "working", owner: "rowena@oswin.co", program: "gap", email: "fran.e@gmail.com", phone: "+61 400 777 888", date: "2026-06-20" },
    { name: "Portia Santos", group: 3, status: "done", owner: "annie@oswin.co", program: "sap400", email: "portia.s@gmail.com", phone: "+61 400 999 000", date: "2026-06-10" },
  ];

  let pos = 0;
  for (const it of sampleItems) {
    const item = await db.item.create({
      data: {
        boardId: board.id,
        groupId: groups[it.group].id,
        name: it.name,
        position: pos++,
      },
    });
    await db.cell.createMany({
      data: [
        { itemId: item.id, columnId: col("Status").id, value: it.status },
        { itemId: item.id, columnId: col("Program").id, value: it.program },
        { itemId: item.id, columnId: col("Email").id, value: it.email },
        { itemId: item.id, columnId: col("Phone").id, value: it.phone },
        { itemId: item.id, columnId: col("Entry Date").id, value: it.date },
      ],
    });
    // person cell (needs personId)
    await db.cell.create({
      data: {
        itemId: item.id,
        columnId: col("Owner").id,
        value: userIds[it.owner],
        personId: userIds[it.owner],
      },
    });
  }

  // A sample automation (shows the model + client's folder feature)
  await db.automation.create({
    data: {
      boardId: board.id,
      name: "Move to Contacting when status = Working",
      folder: "Sales",
      trigger: JSON.stringify({ type: "status_changes", columnId: col("Status").id, to: "working" }),
      action: JSON.stringify({ type: "move_to_group", groupId: groups[1].id }),
    },
  });

  console.log("Seed complete:");
  console.log(`  Org: ${org.name}`);
  console.log(`  Admin login: adnan.mustafa@toptal.com / password`);
  console.log(`  Environments: 3 · Sales board with ${sampleItems.length} items`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
