#!/usr/bin/env node
require("../lib/cli")
  .run()
  .then((code) => process.exit(code));
