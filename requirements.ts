import { aws, identityCenter } from "./provider.ts";
import { icons } from "./icon.ts";
export const requirements = {
  user: { accounts: { aws: aws.many(), identityCenter: identityCenter.many() } },
  icons,
};
