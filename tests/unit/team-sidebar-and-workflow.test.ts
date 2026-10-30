import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

test("team sidebar item exists in omni-proxy section with direct link to /dashboard/team", () => {
  const omniProxySection = sidebarVisibility.SIDEBAR_SECTIONS.find(
    (section) => section.id === "omni-proxy"
  );
  assert.ok(omniProxySection, "expected omni-proxy section to exist");

  const items = sidebarVisibility.getSectionItems(omniProxySection);
  const teamItem = items.find((item) => item.id === "orchestration");
  assert.ok(teamItem, "expected team item (id: orchestration) to exist in omni-proxy section");

  assert.equal(teamItem.href, "/dashboard/team");
  assert.equal(teamItem.icon, "groups");
  assert.equal(teamItem.labelFallback, "Team");
  assert.equal(teamItem.i18nKey, "teamOrchestrator");
});

test("team item is visible in all sidebar presets without being hidden", () => {
  const presets = sidebarVisibility.SIDEBAR_PRESETS;
  const expectedPresetIds = ["all", "essentials", "minimal", "developer", "admin"];

  for (const presetId of expectedPresetIds) {
    const preset = presets.find((p) => p.id === presetId);
    assert.ok(preset, `expected preset '${presetId}' to exist`);
    assert.ok(
      !preset.hiddenItems.includes("orchestration"),
      `expected 'orchestration' (Team) to NOT be hidden in preset '${presetId}'`
    );
  }
});

test("team item is listed in HIDEABLE_SIDEBAR_ITEM_IDS", () => {
  assert.ok(
    sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS.includes("orchestration"),
    "expected HIDEABLE_SIDEBAR_ITEM_IDS to contain 'orchestration'"
  );
});
