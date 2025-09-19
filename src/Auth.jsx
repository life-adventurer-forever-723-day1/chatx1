import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignup(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signUp(
      { email, password },
      { emailRedirectTo: window.location.origin }
    );
    if (error) alert(error.message);
    else alert("Check your email for confirmation link");
  }

  async function handleLogin(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl mb-4">Login / Signup</h2>
      <form className="flex flex-col gap-2 w-64">
        <input className="border p-2" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="border p-2" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="bg-blue-500 text-white p-2" onClick={handleLogin}>Login</button>
        <button className="bg-green-500 text-white p-2" onClick={handleSignup}>Signup</button>
      </form>
    </div>
  );
}
