"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export default function TocHomePage() {
  const { t } = useI18n();
  const [productId, setProductId] = useState("");
  const [token, setToken] = useState("");

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">OnFire Support</h1>
        <p className="text-muted-foreground mt-2">
          Submit and track your support tickets
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access Your Tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="productId">Product ID</Label>
            <Input
              id="productId"
              placeholder="Enter your product ID"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="Enter your access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <Button className="w-full" disabled={!productId || !token}>
            View My Tickets
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Contact your service provider to get your product ID and access
            token. These credentials allow you to submit and track support
            tickets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
