import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// 🔐 Temporary AES-based encryption
async function encryptMessage(message, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))), iv: Array.from(iv) };
}

async function decryptMessage(ciphertext, iv, key) {
  const binary = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    binary
  );

  return new TextDecoder().decode(decrypted);
}

// Hardcoded demo key (replace later with your custom logic!)
const demoKey = new TextEncoder().encode("this_is_a_secret_key_32bytes!!").slice(0, 32);

export default function Chat({ session }) {
  const [username, setUsername] = useState(session.user.email);
  const [receiver, setReceiver] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  // Fetch messages
  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (
            payload.new.sender === session.user.id ||
            payload.new.receiver === session.user.id
          ) {
            fetchMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender.eq.${session.user.id},receiver.eq.${session.user.id}`)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const decrypted = await Promise.all(
        data.map(async (msg) => {
          try {
            const text = await decryptMessage(msg.content, msg.iv, demoKey);
            return { ...msg, text };
          } catch {
            return { ...msg, text: "[decrypt error]" };
          }
        })
      );
      setMessages(decrypted);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!receiver || !message) return;

    const { ciphertext, iv } = await encryptMessage(message, demoKey);

    const { error } = await supabase.from("messages").insert([
      {
        sender: session.user.id,
        receiver,
        content: ciphertext,
        iv,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setMessage("");
      fetchMessages();
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl mb-4">Logged in as {username}</h2>

      <div className="mb-4">
        <input
          className="border p-2 mr-2"
          placeholder="Receiver user ID"
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
        />
        <input
          className="border p-2 mr-2"
          placeholder="Type message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="bg-blue-500 text-white p-2" onClick={sendMessage}>
          Send
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2 rounded ${
              m.sender === session.user.id ? "bg-green-200" : "bg-gray-200"
            }`}
          >
            <strong>{m.sender === session.user.id ? "Me" : m.sender}:</strong>{" "}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}
