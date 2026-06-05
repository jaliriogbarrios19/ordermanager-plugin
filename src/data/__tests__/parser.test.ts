import { describe, it, expect } from "vitest";
import { stringifyYaml, parseYaml } from "../parser";

describe("parseYaml", () => {
  it("parses string values", () => {
    const result = parseYaml("nombre: Juan\nedad: 30");
    expect(result.nombre).toBe("Juan");
    expect(result.edad).toBe(30);
  });

  it("parses booleans", () => {
    const result = parseYaml("activo: true\ninactivo: false");
    expect(result.activo).toBe(true);
    expect(result.inactivo).toBe(false);
  });

  it("parses float numbers", () => {
    const result = parseYaml("precio: 99.99");
    expect(result.precio).toBe(99.99);
  });

  it("parses empty values as empty string", () => {
    const result = parseYaml("campo:\nvacio: null");
    expect(result.campo).toBe("");
    expect(result.vacio).toBe("");
  });

  it("parses quoted values preserving escapes", () => {
    const result = parseYaml('nombre: "Juan P\\u00e9rez"');
    expect(result.nombre).toContain("Juan P");
  });
});

describe("stringifyYaml", () => {
  it("stringifies strings", () => {
    const yaml = stringifyYaml({ nombre: "Juan" });
    expect(yaml).toContain("nombre: Juan");
  });

  it("stringifies numbers", () => {
    const yaml = stringifyYaml({ edad: 30, precio: 99.99 });
    expect(yaml).toContain("edad: 30");
    expect(yaml).toContain("precio: 99.99");
  });

  it("stringifies booleans", () => {
    const yaml = stringifyYaml({ activo: true });
    expect(yaml).toContain("activo: true");
  });

  it("roundtrips string values", () => {
    const original = { nombre: "Juan", ciudad: "Caracas" };
    const yaml = stringifyYaml(original);
    const parsed = parseYaml(yaml);
    expect(parsed.nombre).toBe("Juan");
    expect(parsed.ciudad).toBe("Caracas");
  });
});
