import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, Mail, ArrowLeft } from "lucide-react";

export default function AccessDenied() {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800/50 border-gray-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-red-500" />
          </div>
          <CardTitle className="text-2xl text-white">Access Denied</CardTitle>
          <CardDescription className="text-gray-400">
            You don't have permission to access this application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-300 font-medium">Need access?</p>
                <p className="text-sm text-gray-500">
                  Contact your agency administrator for your login details.
                </p>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={handleLogout}
            variant="outline" 
            className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
