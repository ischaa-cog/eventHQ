import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// No look-alike characters (0/O, 1/l/I), so a password read aloud or retyped still works.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  const chars = Array.from(bytes, b => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

export function clientLoginUrl(): string {
  return `${window.location.origin}/client-login`;
}

export function staffLoginUrl(): string {
  return `${window.location.origin}/admin-login`;
}

// Password input with a Generate button, used wherever staff set a client or user password.
export function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        data-testid={`input-${id}`}
      />
      <Button type="button" variant="outline" onClick={() => onChange(generatePassword())} data-testid={`button-generate-${id}`}>
        <RefreshCw className="h-4 w-4 mr-2" /> Generate
      </Button>
    </div>
  );
}

export interface LoginDetails {
  title: string;
  email: string;
  password: string;
  loginUrl?: string; // defaults to the client login page
}

// Shown once after a login is created or its password reset: the password can't be looked up later.
export function LoginDetailsDialog({ details, onClose }: { details: LoginDetails | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!details) return null;
  const text = `Login link: ${details.loginUrl ?? clientLoginUrl()}\nEmail: ${details.email}\nPassword: ${details.password}`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{details.title}</DialogTitle>
          <DialogDescription>
            Share these details with the person who will sign in. Save the password now — it can't be shown again, only reset.
          </DialogDescription>
        </DialogHeader>
        <pre className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap break-all" data-testid="text-login-details">{text}</pre>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-login-details">Done</Button>
          <Button onClick={copy} data-testid="button-copy-login-details">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copied" : "Copy all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
