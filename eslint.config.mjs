import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const rawTailwindColorPattern =
  /\b(?:bg|text|border|ring|fill|stroke|decoration|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900)(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b/;

function getStaticJsxAttributeValue(node) {
  if (!node?.value) {
    return null;
  }

  if (node.value.type === "Literal" && typeof node.value.value === "string") {
    return node.value.value;
  }

  if (node.value.type !== "JSXExpressionContainer") {
    return null;
  }

  const { expression } = node.value;

  if (expression.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }

  if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
    return expression.quasis.map((part) => part.value.cooked ?? "").join("");
  }

  return null;
}

const templateGuardrails = {
  rules: {
    "no-raw-tailwind-colors": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow raw Tailwind color utilities in composition layers",
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name?.name !== "className") {
              return;
            }

            const value = getStaticJsxAttributeValue(node);
            if (!value) {
              return;
            }

            const match = value.match(rawTailwindColorPattern);
            if (!match) {
              return;
            }

            context.report({
              node,
              message: `Use semantic tokens instead of raw Tailwind color utility "${match[0]}".`,
            });
          },
        };
      },
    },
    "no-jsx-style-prop": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow inline style props in composition layers",
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name?.name !== "style") {
              return;
            }

            context.report({
              node,
              message:
                "Inline style is reserved for canonical primitives that need runtime sizing. Extend the system instead.",
            });
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      template: templateGuardrails,
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/features/**/*.{ts,tsx}", "components/layout/**/*.{ts,tsx}"],
    rules: {
      "template/no-raw-tailwind-colors": "error",
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/features/**/*.{ts,tsx}", "components/layout/**/*.{ts,tsx}"],
    rules: {
      "template/no-jsx-style-prop": "error",
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
      "services/**/*.{ts,tsx}",
      "config/**/*.{ts,tsx}",
    ],
    ignores: ["components/ui/icon.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message: "Import icons through components/ui/icon.tsx and appIcons.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "api/.venv/**",
  ]),
]);

export default eslintConfig;
