import "fake-indexeddb/auto";
import { setKdfIterations } from "../data/vault";

// 600,000 rounds is right for real phones but would make every test wait; tests use few.
setKdfIterations(1000);
