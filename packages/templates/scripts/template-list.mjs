import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templatesPath = path.join(root, "catalog", "templates.json");
const qaProfilesPath = path.join(root, "packages", "qa", "profiles.json");

const { templates } = JSON.parse(fs.readFileSync(templatesPath, "utf8"));
const { profiles } = JSON.parse(fs.readFileSync(qaProfilesPath, "utf8"));
const profileIds = new Set(profiles.map((profile) => profile.id));

for (const template of templates) {
  const qaStatus = profileIds.has(template.qaProfile) ? "qa-ok" : "qa-missing";
  console.log(`${template.id} | ${template.qaProfile} | ${qaStatus} | ${template.coverage.join(",")}`);
}
