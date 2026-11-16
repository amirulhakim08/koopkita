import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { updatePasswordAction } from "@/features/auth/actions";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Tetapkan Kata Laluan" };

export default async function SetPasswordPage() {
  await requireSession();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tetapkan kata laluan baharu</h1>
      <ActionForm action={updatePasswordAction} className="space-y-4" resetOnSuccess>
        <FormField label="Kata laluan baharu" htmlFor="password" required>
          <Input id="password" name="password" type="password" autoComplete="new-password" />
        </FormField>
        <FormField label="Sahkan kata laluan" htmlFor="confirm_password" required>
          <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" />
        </FormField>
        <SubmitButton className="w-full">Simpan</SubmitButton>
      </ActionForm>
    </div>
  );
}
