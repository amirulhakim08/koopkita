"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/errors";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = React.createContext<ActionState>(null);
const PendingContext = React.createContext(false);
export const useFormState = () => React.useContext(FormStateContext);

/** Field errors of the enclosing ActionForm, for a given field name. */
export function useFieldError(name: string): string[] | undefined {
  return useFormState()?.fieldErrors?.[name];
}

export function ActionForm({
  action, children, className, resetOnSuccess = false, successToast = true, showInlineError = true, onSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successToast?: boolean;
  showInlineError?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const opts = React.useRef({ successToast, showInlineError, resetOnSuccess, onSuccess });
  React.useEffect(() => {
    opts.current = { successToast, showInlineError, resetOnSuccess, onSuccess };
  });
  const ref = React.useRef<HTMLFormElement>(null);

  // Toasts fire from the action result itself: after a successful mutation the
  // revalidated page may no longer render this form, so an effect could never run.
  const wrapped = React.useCallback(
    async (prev: ActionState, formData: FormData): Promise<ActionState> => {
      const res = await action(prev, formData);
      const o = opts.current;
      if (res?.ok) {
        if (o.successToast && res.message) toast.success(res.message);
        if (o.resetOnSuccess) ref.current?.reset();
        o.onSuccess?.(res);
      } else if (res?.message && !o.showInlineError) {
        toast.error(res.message);
      }
      return res;
    },
    [action],
  );
  const [state, formAction, isPending] = React.useActionState(wrapped, null);

  // Submit via a transition instead of <form action>, so React does not clear
  // the user's input when the server returns a validation error.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    React.startTransition(() => formAction(fd));
  }

  return (
    <FormStateContext.Provider value={state}>
      <PendingContext.Provider value={isPending}>
      <form ref={ref} onSubmit={onSubmit} className={className} noValidate>
        {showInlineError && state && !state.ok && state.message && (
          <Alert tone="danger" className="mb-4">
            {state.message}
          </Alert>
        )}
        {children}
      </form>
      </PendingContext.Provider>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({ children, pendingText = "Memproses…", ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const pending = React.useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

/** Stable per-form idempotency key: a resubmission of the same form reuses it. */
export function IdempotencyKey() {
  const [key] = React.useState(() => crypto.randomUUID());
  return <input type="hidden" name="idempotency_key" value={key} />;
}

export function FieldError({ name }: { name: string }) {
  const err = useFieldError(name);
  if (!err?.length) return null;
  return <p className="text-xs font-medium text-danger">{err[0]}</p>;
}
