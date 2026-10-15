package main
import (
 "encoding/base64"
 "strings"
 "testing"
)
func TestTrackingAndMaintenanceConfiguration(t *testing.T){
 valid:=base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s",32)))
 for _,tc:=range []struct{name,secret,interval,want string}{
  {"missing secret","","","TRACKING_TOKEN_SECRET is required"},
  {"malformed secret","not-base64","","TRACKING_TOKEN_SECRET must be base64 encoding at least 32 bytes"},
  {"short secret",base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s",31))),"","TRACKING_TOKEN_SECRET must be base64 encoding at least 32 bytes"},
  {"default",valid,"",""},{"explicit",valid,"15s",""},
  {"invalid interval",valid,"bad","ORDER_MAINTENANCE_INTERVAL must be a positive duration"},
  {"zero interval",valid,"0s","ORDER_MAINTENANCE_INTERVAL must be a positive duration"},
 }{t.Run(tc.name,func(t *testing.T){t.Setenv("API_ADDR","127.0.0.1:8080");t.Setenv("DATABASE_URL","postgres://demo:demo@localhost/demo");t.Setenv("MEDIA_BASE_URL","https://media.example/");t.Setenv("TRACKING_TOKEN_SECRET",tc.secret);t.Setenv("ORDER_MAINTENANCE_INTERVAL",tc.interval)
  _,err:=loadConfig();if tc.want!=""{if err==nil || err.Error()!=tc.want{t.Fatalf("error=%v want=%s",err,tc.want)}}else if err!=nil{t.Fatal(err)}
 })}
}
