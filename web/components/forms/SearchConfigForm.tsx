"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSearchConfigAction,
  updateSearchConfigAction,
  type SearchActionResult,
} from "@/lib/actions/search-config";
import { COUNTRY_PRESETS, JOB_TYPE_OPTIONS } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

interface ConfigInitialValues {
  id?: string;
  name: string | null;
  keywords: string;
  jobTypes: string[];
  geoId: string;
  datePosted: string | null;
  sortBy: string;
  active: boolean;
}

const JOB_TYPE_LABELS: Record<(typeof JOB_TYPE_OPTIONS)[number], string> = {
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  FULLTIME: "Full-time",
  PARTTIME: "Part-time",
  INTERNSHIP: "Internship",
  VOLUNTEER: "Volunteer",
  OTHER: "Other",
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? editing
          ? "Saving..."
          : "Creating..."
        : editing
          ? "Save changes"
          : "Create search"}
    </Button>
  );
}

export function SearchConfigForm({ initial }: { initial?: ConfigInitialValues }) {
  const editing = Boolean(initial?.id);
  const action = editing
    ? updateSearchConfigAction.bind(null, initial!.id!)
    : createSearchConfigAction;

  const [state, formAction] = useActionState<SearchActionResult | null, FormData>(action, null);

  const presetMatch = COUNTRY_PRESETS.find((c) => c.geoId === (initial?.geoId ?? ""));
  const [country, setCountry] = useState<string>(
    initial?.geoId ? (presetMatch ? presetMatch.geoId : "custom") : COUNTRY_PRESETS[0].geoId
  );
  const [customGeoId, setCustomGeoId] = useState<string>(
    initial?.geoId && !presetMatch ? initial.geoId : ""
  );

  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Name (optional)" htmlFor="name" hint="Used to recognize this search later.">
        <Input
          id="name"
          name="name"
          defaultValue={initial?.name ?? ""}
          placeholder="e.g. NL Freelance / Contract"
          maxLength={80}
        />
      </Field>

      <Field
        label="Keywords"
        htmlFor="keywords"
        hint='LinkedIn search syntax. Example: "freelance OR contractor OR consultant"'
      >
        <Input
          id="keywords"
          name="keywords"
          defaultValue={initial?.keywords ?? ""}
          required
          maxLength={500}
        />
      </Field>

      <Field label="Country" htmlFor="country">
        <Select
          id="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          {COUNTRY_PRESETS.map((c) => (
            <option key={c.geoId} value={c.geoId}>
              {c.label} ({c.geoId})
            </option>
          ))}
          <option value="custom">Custom geoId...</option>
        </Select>
      </Field>

      {country === "custom" ? (
        <Field
          label="Custom LinkedIn geoId"
          htmlFor="geoId"
          hint="Find one by searching jobs on LinkedIn and copying the geoId from the URL."
        >
          <Input
            id="geoId"
            name="geoId"
            value={customGeoId}
            onChange={(e) => setCustomGeoId(e.target.value)}
            required
          />
        </Field>
      ) : (
        <input type="hidden" name="geoId" value={country} />
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-brand-ink">Job types</legend>
        <p className="text-xs text-brand-ink-400">Leave empty to include every job type.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {JOB_TYPE_OPTIONS.map((value) => {
            const checked = initial?.jobTypes?.includes(value);
            return (
              <label key={value} className="flex items-center gap-2 text-sm text-brand-ink">
                <input
                  type="checkbox"
                  name="jobTypes"
                  value={value}
                  defaultChecked={checked}
                  className="h-4 w-4 rounded border-brand-ink-300 text-brand-orange focus:ring-brand-orange-400"
                />
                {JOB_TYPE_LABELS[value]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="Posted within" htmlFor="datePosted">
        <Select id="datePosted" name="datePosted" defaultValue={initial?.datePosted ?? ""}>
          <option value="">Any time</option>
          <option value="past-day">Past 24 hours</option>
          <option value="past-week">Past week</option>
          <option value="past-month">Past month</option>
        </Select>
      </Field>

      <Field label="Sort by" htmlFor="sortBy">
        <Select id="sortBy" name="sortBy" defaultValue={initial?.sortBy ?? "DD"}>
          <option value="DD">Most recent</option>
          <option value="R">Most relevant</option>
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-sm text-brand-ink">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial?.active ?? true}
          className="h-4 w-4 rounded border-brand-ink-300 text-brand-orange focus:ring-brand-orange-400"
        />
        Active (the daily run will use this search)
      </label>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <SubmitButton editing={editing} />
      </div>
    </form>
  );
}
