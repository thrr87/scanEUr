import {
  validateAlternative,
  validateFingerprint,
  validateVendorProfile
} from "@scaneur/types";

function issue(path, message) {
  return { path, message };
}

function ok(input, errors) {
  return errors.length === 0
    ? { success: true, data: input, errors: [] }
    : { success: false, errors };
}

function formatNestedError(prefix, error) {
  return issue(`${prefix}${error.path ? `.${error.path}` : ""}`, error.message);
}

function validateCollection(input, path, itemKey, validator) {
  const errors = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ok(input, [issue(path || "<root>", "expected object")]);
  }

  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== itemKey) {
    errors.push(issue(path || "<root>", `expected only field "${itemKey}"`));
  }

  const items = input[itemKey];
  if (!Array.isArray(items)) {
    errors.push(issue(itemKey, "expected array"));
    return ok(input, errors);
  }

  const seenIds = new Map();
  items.forEach((item, index) => {
    const prefix = `${itemKey}[${index}]`;
    const result = validator(item);
    if (!result.success) {
      errors.push(...result.errors.map((error) => formatNestedError(prefix, error)));
      return;
    }

    const previousIndex = seenIds.get(item.id);
    if (previousIndex !== undefined) {
      errors.push(issue(`${prefix}.id`, `duplicate id also used at ${itemKey}[${previousIndex}].id`));
    } else {
      seenIds.set(item.id, index);
    }
  });

  return ok(input, errors);
}

export function validateVendorDatabase(input) {
  return validateCollection(input, "", "vendors", validateVendorProfile);
}

export function validateFingerprintDatabase(input) {
  return validateCollection(input, "", "fingerprints", validateFingerprint);
}

export function validateAlternativesDatabase(input) {
  return validateCollection(input, "", "alternatives", validateAlternative);
}

export function formatRuleValidationErrors(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}

function assertWith(validator, input, label) {
  const result = validator(input);
  if (!result.success) {
    throw new Error(`${label} validation failed:\n${formatRuleValidationErrors(result.errors)}`);
  }
  return input;
}

export const assertVendorDatabase = (input) => assertWith(validateVendorDatabase, input, "Vendor database");
export const assertFingerprintDatabase = (input) =>
  assertWith(validateFingerprintDatabase, input, "Fingerprint database");
export const assertAlternativesDatabase = (input) =>
  assertWith(validateAlternativesDatabase, input, "Alternatives database");

export const ruleSchemas = {
  vendorDatabase: { validate: validateVendorDatabase, assert: assertVendorDatabase },
  fingerprintDatabase: { validate: validateFingerprintDatabase, assert: assertFingerprintDatabase },
  alternativesDatabase: { validate: validateAlternativesDatabase, assert: assertAlternativesDatabase }
};
