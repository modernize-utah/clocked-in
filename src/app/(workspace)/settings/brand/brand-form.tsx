"use client";

import { removeTenantBrandAction, uploadTenantBrandAction } from "@/app/actions/tenants";
import { ImageUploader, imageUploaderHint } from "@/components/image-uploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useTenant } from "@/hooks/use-workspace";
import { brandAssetSrc, brandField, type BrandKind } from "@/lib/brand";

const copy: Record<
  BrandKind,
  {
    title: string;
    description: string;
    empty: string;
    surface: "muted" | "dark" | "light";
    shape: "square" | "wide";
  }
> = {
  mark: {
    title: "Favicon",
    description: "Square mark for the browser tab and the sidebar icon. Uploads are cropped to 64×64.",
    empty: "Drag and drop a favicon",
    surface: "muted",
    shape: "square",
  },
  wordmark: {
    title: "Light on dark",
    description: "Wordmark for the sidebar and other dark surfaces. Uploads are fit inside 800×200.",
    empty: "Drag and drop a logo",
    surface: "dark",
    shape: "wide",
  },
  wordmarkOnLight: {
    title: "Dark on light",
    description: "Wordmark for light pages. Uploads are fit inside 800×200.",
    empty: "Drag and drop a logo",
    surface: "light",
    shape: "wide",
  },
};

export function BrandForm() {
  return (
    <Tabs defaultValue="favicon">
      <TabsList variant="line">
        <TabsTrigger value="favicon">Favicon</TabsTrigger>
        <TabsTrigger value="logos">Logos</TabsTrigger>
      </TabsList>
      <TabsContent value="favicon" className="mt-4">
        <BrandAssetCard kind="mark" />
      </TabsContent>
      <TabsContent value="logos" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>
              Upload a light-on-dark wordmark for the sidebar and a dark-on-light wordmark for light backgrounds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <BrandAssetFields kind="wordmark" />
            <BrandAssetFields kind="wordmarkOnLight" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function BrandAssetCard({ kind }: { kind: BrandKind }) {
  const labels = copy[kind];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <BrandAssetFields kind={kind} />
      </CardContent>
    </Card>
  );
}

function BrandAssetFields({ kind }: { kind: BrandKind }) {
  const tenant = useTenant();
  const storedUrl = tenant[brandField(kind)];
  const src = brandAssetSrc(kind, storedUrl);
  const labels = copy[kind];
  const upload = useActionMutation(
    (file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return uploadTenantBrandAction(tenant.id, kind, formData);
    },
    { errorToast: false },
  );
  const remove = useActionMutation<void>(() => removeTenantBrandAction(tenant.id, kind), {
    errorToast: false,
  });

  return (
    <div className="grid gap-3">
      {kind !== "mark" ? (
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{labels.title}</p>
          <p className="text-sm text-muted-foreground">{labels.description}</p>
        </div>
      ) : null}
      <ImageUploader
        src={src}
        emptyLabel={labels.empty}
        hint={imageUploaderHint}
        surface={labels.surface}
        shape={labels.shape}
        onUpload={(file) => upload.mutateAsync(file)}
        onRemove={storedUrl ? () => remove.mutateAsync() : undefined}
      />
    </div>
  );
}
