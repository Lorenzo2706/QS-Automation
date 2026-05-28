import { SearchConfigForm } from "@/components/forms/SearchConfigForm";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";

export default function NewSearchPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">New search</h1>
        <p className="text-sm text-brand-ink-500">
          Build a LinkedIn job search. We&apos;ll save the parameters and the resulting
          LinkedIn URL.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Search settings</CardTitle>
          <CardSubtitle>
            You can leave the name blank or set anything memorable.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          <SearchConfigForm />
        </CardBody>
      </Card>
    </div>
  );
}
