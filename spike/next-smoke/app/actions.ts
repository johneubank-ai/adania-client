"use server";
import { revalidatePath } from "next/cache";
import { counter } from "../lib/counter";

export async function bump() {
  counter.n++;
  revalidatePath("/");
}
