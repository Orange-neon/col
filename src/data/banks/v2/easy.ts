import { easyProblems as v1EasyProblems } from "../v1/easy";
import { newEasyProblems } from "./newEasy";

export const easyProblems = [...v1EasyProblems, ...newEasyProblems];
