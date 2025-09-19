import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  generateKeyPair,
  encryptWithPublicJwk,
  decryptWithPrivateJwk
} from "./cryptoHelpers";

function useAuthListener(setUser) {
  useEffect(() => {
    const session = supabase.auth.getSession().then(r => {
      if (r?.data?.session?.user) setUser(r.data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      if (listener) listener.subscription.unsubscribe();
    };
  }, [setUser]);
}

function Auth({ onReady }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");

  async function signUp() {
    setStatus("creating account...");
    // create auth user
    const { data, error } = await supabase.auth.signUp({ email, password: "password" + Math.random().toString(36).slice(2,8) });
    if (error) return setStatus("signup error: " + error.message);
    setStatus("Check your email to confirm (Supabase sends magic link).");
  }

  async function finishProfile(userId, publicJwk) {
    // Upsert profile into profiles table
    await supabase.from("profiles").upsert({ id: userId, username, public_key: JSON.stringify(publicJwk) });
  }

  async function createLocalKeysAndProfile() {
    setStatus("generating keys...");
    const { publicJwk, privateJwk } = await generateKeyPair();
    // store private key in localStorage (for production: use IndexedDB)
    localStorage.setItem("privateKeyJwk", JSON.stringify(privateJwk));
    // save public key in profiles after user confirms logged in
    const user = (await supabase.auth.getSession()).data?.session?.user;
    if (!user) return setStatus("login first (use the email link Supabase sent) and then click 'Save keys' here.");
    await finishProfile(user.id, publicJwk);
    setStatus("profile saved with public key.");
    onReady();
  }

  return (
    <div className="auth-card">
      <h3>Sign up / Profile</h3>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="username (unique)" value={username} onChange={e=>setUsername(e.target.value)} />
      <div style={{display:"flex",gap:8}}>
        <button onClick={signUp}>Sign up (magic link)</button>
        <button onClick={createLocalKeysAndProfile}>Save keys & publish public key</button>
      </div>
      <p>{status}</p>
    </div>
  );
}

function Chat({ user }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [outText, setOutText] = useState("");
  const subRef = useRef(null);

  useEffect(() => {
    async function subscribe() {
      if (!user) return;
      // subscribe to messages where receiver == user.id
      const { data: realtimeSub } = supabase
        .channel("public:messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver=eq.${user.id}` }, payload => {
          setMessages(prev => [...prev, payload.new]);
        })
        .subscribe();
      subRef.current = realtimeSub;
    }
    subscribe();
    return () => {
      if (subRef.current) supabase.removeChannel(subRef.current);
    };
  }, [user]);

  async function searchUsers() {
    if (!query) return setSearchResults([]);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,public_key")
      .ilike("username", `%${query}%`)
      .limit(10);
    if (error) console.error(error);
    setSearchResults(data || []);
  }

  async function sendMessage() {
    if (!selectedUser) return alert("choose a user");
    const publicJwk = JSON.parse(selectedUser.public_key);
    // encrypt using helper function (replace this call if using your own logic)
    const cipher = await encryptWithPublicJwk(outText, publicJwk);
    await supabase.from("messages").insert([{ sender: user.id, receiver: selectedUser.id, ciphertext: cipher }]);
    setOutText("");
    // also append locally as outgoing message (for UI)
    setMessages(prev => [...prev, { sender: user.id, receiver: selectedUser.id, ciphertext: cipher, created_at: new Date().toISOString() }]);
  }

  async function decryptedTextIfMine(msg) {
    // decrypt only if you're the receiver (or if this was your outgoing and you have private key you'd decrypt as well)
    try {
      const privateJwk = JSON.parse(localStorage.getItem("privateKeyJwk"));
      if (!privateJwk) return "[no private key stored locally]";
      const plain = await decryptWithPrivateJwk(msg.ciphertext, privateJwk);
      return plain;
    } catch (e) {
      return "[decrypt error]";
    }
  }

  return (
    <div style={{display:"flex",gap:20}}>
      <div style={{width:260}}>
        <h4>Find users</h4>
        <input placeholder="search username" value={query} onChange={e=>setQuery(e.target.value)} />
        <button onClick={searchUsers}>Search</button>
        <div>
          {searchResults.map(s => (
            <div key={s.id} className={`user-item ${selectedUser?.id===s.id ? 'selected':''}`} onClick={()=>setSelectedUser(s)}>
              <strong>{s.username}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{flex:1}}>
        <h4>Chat with {selectedUser ? selectedUser.username : "— select a user —"}</h4>
        <div className="messages">
          {messages.filter(m => (m.sender===user.id && m.receiver===selectedUser?.id) || (m.receiver===user.id && m.sender===selectedUser?.id))
            .map((m, idx) => (
            <MessageRow key={idx} msg={m} mine={m.sender===user.id} decryptFn={decryptedTextIfMine} />
          ))}
        </div>

        <div style={{display:"flex",gap:8,marginTop:10}}>
          <input style={{flex:1}} value={outText} onChange={e=>setOutText(e.target.value)} placeholder="type message" />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ msg, mine, decryptFn }) {
  const [plain, setPlain] = useState("[loading]");
  useEffect(() => {
    let mounted = true;
    (async () => {
      const p = await decryptFn(msg);
      if (mounted) setPlain(p);
    })();
    return () => mounted = false;
  }, [msg, decryptFn]);

  return (
    <div className={`msg-row ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble">{plain}</div>
      <div className="ts">{new Date(msg.created_at).toLocaleTimeString()}</div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  useAuthListener(setUser);
  const [ready, setReady] = useState(false);

  return (
    <div className="app">
      <header><h2>Vibe Chat — E2EE (client-side keys)</h2></header>

      {!user && <p>Please sign up / login via the Supabase magic link. Then click "Save keys & publish public key".</p>}
      {!ready && <Auth onReady={()=>setReady(true)} />}

      {user && ready && <Chat user={user} />}

      <footer style={{marginTop:20,fontSize:12}}>Tip: replace cryptoHelpers.js with your own logic. Private key stored locally only.</footer>
    </div>
  );
}
