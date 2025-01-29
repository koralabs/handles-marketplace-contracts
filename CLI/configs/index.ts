import { Parameters } from "../../src/types.js";

export const configs: Record<string, Parameters> = {
  preprod: {
    marketplaceAddress:
      "addr_test1qrysw490dkldwfqwpkwmnq39mcvt9xzy8kxxqnafh37lcvv764lmjcyrjyh8c8fjkkt22r47mheznsg47t7ly9yv8fysevzwtf",
    authorizers: ["c4c2d1d080900cb6d25d87b774954410d01fd3e6bb21e25d09130fa5"],
  },
  preview: {
    marketplaceAddress:
      "addr_test1qpzxs06vn7qagrqsm7wtquul8s5drxzk82wwr9qx3886m8lv7yv3mukuwdkne3v3va8dgd3xjkzqv90pu9gsc8hrl2xs9yqkej",
    authorizers: ["0c0647ff15d2df88897eb2471d9aba909cdcc842ad7c387ec0712725"],
  },
};
