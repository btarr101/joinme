import * as path from "path";

function getParentDir(dirname: string, level: number = 1): string {
  return level <= 0 ? dirname : getParentDir(path.dirname(dirname), level - 1);
}

export const rootDirectory = getParentDir(__dirname, 2);
