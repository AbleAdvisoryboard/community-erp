import { getDb } from "./connection.js";

const roles = [
  "Admin",
  "Finance",
  "Program",
  "Fundraising",
  "VolunteerMgr",
  "Intelligence",
  "ReadOnly",
];

const permissions = {
  "auth.manage_users": "Create and manage user accounts",
  "auth.view_audit": "View audit logs",
  "crm.read": "View CRM records",
  "crm.write": "Modify CRM records",
  "fundraising.read": "View fundraising data",
  "fundraising.write": "Manage fundraising data",
  "finance.read": "View financial data",
  "finance.write": "Post financial transactions",
  "inventory.read": "View inventory and assets",
  "inventory.write": "Manage inventory and assets",
  "programs.read": "View program and case data",
  "programs.write": "Manage program and case data",
  "projects.read": "View project boards and knowledge pages",
  "projects.write": "Manage projects and knowledge content",
  "events.read": "View events and registrations",
  "events.write": "Manage events and registrations",
  "volunteers.read": "View volunteer data",
  "volunteers.write": "Manage volunteers and shifts",
  "reports.run": "Run and export reports",
  "reports.manage": "Create and manage report definitions",
  "communications.send": "Send outbound communications",
  "admin.manage_settings": "Manage system settings and imports",
};

const rolePermissionMap = new Map([
  ["Admin", Object.keys(permissions)],
  [
    "Finance",
    [
      "auth.view_audit",
      "finance.read",
      "finance.write",
      "fundraising.read",
      "inventory.read",
      "reports.run",
      "reports.manage",
    ],
  ],
  ["Program", ["crm.read", "programs.read", "programs.write", "reports.run"]],
  [
    "Fundraising",
    [
      "crm.read",
      "crm.write",
      "fundraising.read",
      "fundraising.write",
      "events.read",
      "events.write",
      "communications.send",
      "reports.run",
    ],
  ],
  [
    "VolunteerMgr",
    ["volunteers.read", "volunteers.write", "events.read", "events.write", "reports.run"],
  ],
  [
    "ReadOnly",
    [
      "crm.read",
      "fundraising.read",
      "finance.read",
      "inventory.read",
      "programs.read",
      "projects.read",
      "events.read",
      "volunteers.read",
      "reports.run",
    ],
  ],
]);

function seedRoles(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO roles (name, description) VALUES (@name, @description)"
  );
  for (const roleName of roles) {
    insert.run({ name: roleName, description: `${roleName} role` });
  }
}

function seedPermissions(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO permissions (name, description) VALUES (@name, @description)"
  );
  for (const [name, description] of Object.entries(permissions)) {
    insert.run({ name, description });
  }
}

function seedRolePermissions(db) {
  const findRole = db.prepare("SELECT id FROM roles WHERE name = ?");
  const findPermission = db.prepare("SELECT id FROM permissions WHERE name = ?");
  const insert = db.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)"
  );

  for (const [roleName, permissionNames] of rolePermissionMap.entries()) {
    const role = findRole.get(roleName);
    if (!role) continue;

    for (const permName of permissionNames) {
      const perm = findPermission.get(permName);
      if (perm) {
        insert.run(role.id, perm.id);
      }
    }
  }
}

export function seedAccessCore(db = getDb()) {
  seedRoles(db);
  seedPermissions(db);
  seedRolePermissions(db);
}
