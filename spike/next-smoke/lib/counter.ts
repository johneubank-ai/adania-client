// Server-side module state shared between the RSC page and the Server Action,
// proving the `use server` action mutates server state and the page re-renders.
export const counter = { n: 0 };
