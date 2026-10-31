import "fake-indexeddb/auto";
import { setKdfIterations } from "../data/vault";

// 600,000 rounds is right for real phones but would make every test wait; tests use few.
setKdfIterations(1000);

// The suite runs many screens in parallel; a busy machine can take more than the default 1 second to settle.
import { configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 8000 });
