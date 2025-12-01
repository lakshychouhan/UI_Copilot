const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const forbiddenIdentifiers = new Set([
  "eval",
  "Function",
  "setTimeout",
  "setInterval",
]);

const forbiddenMembers = [
  "dangerouslySetInnerHTML",
  "localStorage",
  "sessionStorage",
  "window",
  "document",
];

function validate(code) {
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx"],
  });

  let safe = true;
  const reasons = [];

  traverse(ast, {
    Identifier(path) {
      if (forbiddenIdentifiers.has(path.node.name)) {
        safe = false;
        reasons.push(`Forbidden identifier: ${path.node.name}`);
      }
    },
    MemberExpression(path) {
      const name = path.node.property.name;
      if (forbiddenMembers.includes(name)) {
        safe = false;
        reasons.push(`Forbidden member: ${name}`);
      }
    },
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (!["react"].includes(source)) {
        safe = false;
        reasons.push(`Forbidden import: ${source}`);
      }
    },
  });

  return { safe, reasons };
}

// CLI usage: node validate.js "<code>"
const code = process.argv[2] || "";
const result = validate(code);
console.log(JSON.stringify(result));
