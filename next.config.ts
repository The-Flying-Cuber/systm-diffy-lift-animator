import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const isAccountPagesRepository = repositoryName.endsWith(".github.io");
const basePath =
  isGitHubPagesBuild && repositoryName && !isAccountPagesRepository
    ? `/${repositoryName}`
    : "";

const nextConfig: NextConfig = {
  ...(isGitHubPagesBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        basePath,
        assetPrefix: basePath || undefined,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
