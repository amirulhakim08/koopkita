import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/features/auth/actions";

export const metadata = { title: "Lupa Kata Laluan" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Lupa kata laluan</h1>
        <p className="text-sm text-muted-foreground">Masukkan e-mel anda untuk menerima pautan tetapan semula.</p>
      </div>
      <ActionForm action={forgotPasswordAction} className="space-y-4" resetOnSuccess>
        <FormField label="E-mel" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </FormField>
        <SubmitButton className="w-full">Hantar pautan</SubmitButton>
      </ActionForm>
      <Link href="/log-masuk" className="block text-center text-sm font-medium text-primary hover:underline">Kembali ke log masuk</Link>
    </div>
  );
}
