"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanizeKB = HumanizeKB;
function HumanizeKB(kb) {
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = kb;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    const precision = value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[i]}`;
}
